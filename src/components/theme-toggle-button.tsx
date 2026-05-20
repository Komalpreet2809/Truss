"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") {
    return "dark";
  }

  const saved = localStorage.getItem("truss-theme");
  return saved === "light" || saved === "dark" ? saved : "dark";
}

export function ThemeToggleButton() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const iconColor =
    theme === "dark" ? "#ffffff" : "var(--accent-coral)";

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    localStorage.setItem("truss-theme", theme);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme((prev) => (prev === "light" ? "dark" : "light"))}
      className="flex h-10 w-10 items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer"
      title={`Switch to ${theme === "light" ? "Espresso Dark" : "Warm Light"} mode`}
      aria-label="Toggle dark mode"
    >
      {theme === "light" ? (
        <svg
          className="animate-pop-in"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke={iconColor}
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        <svg
          className="animate-pop-in"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke={iconColor}
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      )}
    </button>
  );
}
