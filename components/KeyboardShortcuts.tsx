"use client";

import { useEffect } from "react";
import { useUiStore, useFilterStore } from "@/lib/store";

export function KeyboardShortcuts() {
  const { selected, setSelected } = useUiStore();
  const { tab, setTab, query, setQuery } = useFilterStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger shortcuts if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        // Allow Esc to close modal even when in input
        if (e.key === "Escape" && selected) {
          e.preventDefault();
          setSelected(null);
        }
        return;
      }

      // Ctrl+K or / to focus search
      if ((e.ctrlKey && e.key === "k") || e.key === "/") {
        e.preventDefault();
        
        // Focus the search input
        const searchInput = document.getElementById("global-search-input") as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }

      // Esc to close modal
      if (e.key === "Escape" && selected) {
        e.preventDefault();
        setSelected(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selected, setSelected, tab, setTab, setQuery]);

  return null; // This component doesn't render anything
}
