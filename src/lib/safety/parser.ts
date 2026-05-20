import type {
  AstNode,
  NodeStatus,
  ParseArtifact,
  ParsedToken,
  SafetyDomain,
} from "@/lib/safety/types";

const SHELL_BLOCKED = new Set([
  "rm",
  "rmdir",
  "del",
  "format",
  "mkfs",
  "shutdown",
  "reboot",
  "diskpart",
  "remove-item",
  "sudo",
  "runas",
]);

const SQL_MUTATION = new Set([
  "drop",
  "delete",
  "truncate",
  "insert",
  "update",
  "alter",
  "create",
]);

const PYTHON_RISKY = new Set([
  "os.system",
  "subprocess.run",
  "subprocess.call",
  "subprocess.popen",
  "eval",
  "exec",
  "os.remove",
  "os.unlink",
  "shutil.rmtree",
]);

function splitLines(output: string) {
  return output.replace(/\r\n/g, "\n").split("\n");
}

function countNodes(node: AstNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}

function buildTokenKind(domain: SafetyDomain, token: string) {
  const normalized = token.toLowerCase();

  if (/^["'`].*["'`]$/.test(token)) {
    return "literal";
  }

  if (/^[0-9]+$/.test(token)) {
    return "number";
  }

  if (domain === "sql") {
    if (SQL_MUTATION.has(normalized) || ["select", "from", "where", "join", "with"].includes(normalized)) {
      return "keyword";
    }
  }

  if (domain === "shell") {
    if (SHELL_BLOCKED.has(normalized) || ["curl", "wget", "ls", "dir", "cat", "echo"].includes(normalized)) {
      return "command";
    }
  }

  if (domain === "python") {
    if (token.includes(".")) {
      return "call";
    }

    if (["import", "def", "for", "return"].includes(normalized)) {
      return "keyword";
    }
  }

  if (/^[(){}\[\],;:+\-/*|&=.]+$/.test(token)) {
    return "symbol";
  }

  return "identifier";
}

function tokenizeOutput(domain: SafetyDomain, output: string): ParsedToken[] {
  const matcher =
    /[A-Za-z_][\w.]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\d+|==|!=|<=|>=|&&|\|\||[(){}\[\],;:+\-/*|&=.]/g;

  const tokens: ParsedToken[] = [];
  const lines = splitLines(output);

  for (const [index, line] of lines.entries()) {
    const matches = line.match(matcher) ?? [];

    for (const [tokenIndex, token] of matches.entries()) {
      const normalized = token.toLowerCase();
      const blocked =
        (domain === "shell" && SHELL_BLOCKED.has(normalized)) ||
        (domain === "sql" && SQL_MUTATION.has(normalized)) ||
        (domain === "python" && PYTHON_RISKY.has(normalized));

      tokens.push({
        id: `tok-${index + 1}-${tokenIndex + 1}`,
        value: token,
        normalized,
        kind: buildTokenKind(domain, token),
        line: index + 1,
        blocked,
        reason: blocked ? "Matches a blocked structural token." : undefined,
      });
    }
  }

  return tokens;
}

function makeNode(
  id: string,
  label: string,
  kind: string,
  status: NodeStatus,
  line?: number,
  detail?: string,
  children: AstNode[] = [],
): AstNode {
  return { id, label, kind, status, line, detail, children };
}

function parseShell(output: string, tokens: ParsedToken[]): ParseArtifact {
  const lines = splitLines(output);
  const children: AstNode[] = [];

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const segments = line
      .split(/&&|\|\||;/)
      .map((segment) => segment.trim())
      .filter(Boolean);

    const segmentNodes = segments.map((segment, segmentIndex) => {
      const command = segment.split(/\s+/)[0] ?? "command";
      const isBlocked = SHELL_BLOCKED.has(command.toLowerCase());
      const lineTokens = tokens.filter((token) => token.line === index + 1);
      const tokenLeaves = lineTokens
        .filter((token) => segment.toLowerCase().includes(token.normalized))
        .slice(0, 6)
        .map((token) =>
          makeNode(
            `${token.id}-leaf`,
            token.value,
            token.kind,
            token.blocked ? "blocked" : "neutral",
            token.line,
          ),
        );

      return makeNode(
        `shell-${index + 1}-${segmentIndex + 1}`,
        isBlocked ? `BlockedCommand(${command})` : `Command(${command})`,
        "command",
        isBlocked ? "blocked" : "safe",
        index + 1,
        segment,
        tokenLeaves,
      );
    });

    children.push(
      makeNode(
        `shell-line-${index + 1}`,
        `Line ${index + 1}`,
        "line",
        segmentNodes.some((node) => node.status === "blocked") ? "blocked" : "neutral",
        index + 1,
        line,
        segmentNodes,
      ),
    );
  }

  return {
    domain: "shell",
    root: makeNode(
      "root-shell",
      `ShellProgram(${countNodes(makeNode("tmp", "tmp", "tmp", "neutral", undefined, undefined, children)) - 1} nodes)`,
      "program",
      children.some((node) => node.status === "blocked") ? "blocked" : "safe",
      undefined,
      undefined,
      children,
    ),
    tokens,
    lineMap: lines,
    summary: "Deterministic shell command segmentation with blocked primitive detection.",
  };
}

function parseSql(output: string, tokens: ParsedToken[]): ParseArtifact {
  const lines = splitLines(output);
  const statements: Array<{ line: number; text: string }> = [];
  let current = "";
  let startLine = 1;

  for (const [index, line] of lines.entries()) {
    if (!current) {
      startLine = index + 1;
    }

    current += `${line}\n`;

    if (line.includes(";")) {
      statements.push({ line: startLine, text: current.trim() });
      current = "";
    }
  }

  if (current.trim()) {
    statements.push({ line: startLine, text: current.trim() });
  }

  const children = statements.map((statement, index) => {
    const text = statement.text.trim();
    const firstWord = text.split(/\s+/)[0]?.toUpperCase() ?? "UNKNOWN";
    const blocked = SQL_MUTATION.has(firstWord.toLowerCase());
    const clauseNodes = ["SELECT", "FROM", "WHERE", "JOIN", "ORDER BY", "TRUNCATE", "DELETE", "DROP"]
      .filter((clause) => text.toUpperCase().includes(clause))
      .map((clause, clauseIndex) =>
        makeNode(
          `sql-${index + 1}-${clauseIndex + 1}`,
          clause,
          "clause",
          SQL_MUTATION.has(clause.toLowerCase()) ? "blocked" : "neutral",
          statement.line,
        ),
      );

    return makeNode(
      `sql-stmt-${index + 1}`,
      `${firstWord}Statement`,
      "statement",
      blocked ? "blocked" : "safe",
      statement.line,
      text,
      clauseNodes,
    );
  });

  return {
    domain: "sql",
    root: makeNode(
      "root-sql",
      `SqlProgram(${children.length} statements)`,
      "program",
      children.some((node) => node.status === "blocked") ? "blocked" : "safe",
      undefined,
      undefined,
      children,
    ),
    tokens,
    lineMap: lines,
    summary: "Statement-oriented SQL parse with mutation keyword isolation.",
  };
}

function parsePython(output: string, tokens: ParsedToken[]): ParseArtifact {
  const lines = splitLines(output);
  const children = lines
    .map((rawLine, index) => {
      const line = rawLine.trim();

      if (!line) {
        return null;
      }

      const callMatches = Array.from(line.matchAll(/([A-Za-z_][\w.]*)\s*\(/g));
      const importMatch = line.match(/^import\s+([A-Za-z_][\w.]*)/);
      const kind = importMatch
        ? "import"
        : line.startsWith("for ")
          ? "loop"
          : line.startsWith("def ")
            ? "function"
            : callMatches.length > 0
              ? "call"
              : "statement";

      const childCalls = callMatches.map((match, callIndex) => {
        const callee = match[1];
        const blocked = PYTHON_RISKY.has(callee.toLowerCase());

        return makeNode(
          `py-${index + 1}-${callIndex + 1}`,
          blocked ? `BlockedCall(${callee})` : `Call(${callee})`,
          "call",
          blocked ? "blocked" : "neutral",
          index + 1,
        );
      });

      const importName = importMatch?.[1];
      const importBlocked =
        importName !== undefined &&
        ["os", "subprocess", "shutil"].includes(importName.toLowerCase());

      return makeNode(
        `py-line-${index + 1}`,
        kind === "import"
          ? `Import(${importName ?? "unknown"})`
          : kind === "loop"
            ? "ForLoop"
            : kind === "function"
              ? "FunctionDef"
              : kind === "call"
                ? "ExpressionStatement"
                : "Statement",
        kind,
        importBlocked || childCalls.some((node) => node.status === "blocked")
          ? "blocked"
          : "safe",
        index + 1,
        line,
        childCalls,
      );
    })
    .filter((node): node is AstNode => node !== null);

  return {
    domain: "python",
    root: makeNode(
      "root-python",
      `PythonModule(${children.length} lines)`,
      "module",
      children.some((node) => node.status === "blocked") ? "blocked" : "safe",
      undefined,
      undefined,
      children,
    ),
    tokens,
    lineMap: lines,
    summary: "Line-oriented Python parse with import and call-site extraction.",
  };
}

function parseGeneral(output: string, tokens: ParsedToken[]): ParseArtifact {
  const lines = splitLines(output);
  const children = lines
    .map((line, index) =>
      line.trim()
        ? makeNode(
            `general-line-${index + 1}`,
            `TextLine(${index + 1})`,
            "line",
            "neutral",
            index + 1,
            line.trim(),
          )
        : null,
    )
    .filter((node): node is AstNode => node !== null);

  return {
    domain: "general",
    root: makeNode(
      "root-general",
      `UnclassifiedOutput(${children.length} lines)`,
      "document",
      "neutral",
      undefined,
      undefined,
      children,
    ),
    tokens,
    lineMap: lines,
    summary: "Fallback line parser used when no specialized verifier is selected.",
  };
}

export function countAstNodes(root: AstNode) {
  return countNodes(root);
}

export function parseCandidate(domain: SafetyDomain, output: string): ParseArtifact {
  const tokens = tokenizeOutput(domain, output);

  switch (domain) {
    case "shell":
      return parseShell(output, tokens);
    case "sql":
      return parseSql(output, tokens);
    case "python":
      return parsePython(output, tokens);
    default:
      return parseGeneral(output, tokens);
  }
}
