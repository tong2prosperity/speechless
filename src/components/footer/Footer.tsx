import React, { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";

import ModelSelector from "../model-selector";
import LlmSelector from "./LlmSelector";
import UpdateChecker from "../update-checker";

const Footer: React.FC = () => {
  const [version, setVersion] = useState("0.0.2");

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const appVersion = await getVersion();
        setVersion(appVersion);
      } catch (error) {
        console.error("Failed to get app version:", error);
        setVersion("0.0.2");
      }
    };

    fetchVersion();
  }, []);

  return (
    <footer className="bg-white border-t border-zinc-200 px-4 h-9 flex items-center justify-between text-xs text-zinc-500 select-none">
      <div className="flex items-center gap-4">
        <ModelSelector />
        <div className="w-px h-3 bg-zinc-200 mx-1" />
        <LlmSelector />
      </div>
      <div className="flex items-center gap-4">
        <UpdateChecker />
        <span className="font-mono text-zinc-400">v{version}</span>
      </div>
    </footer>
  );
};

export default Footer;
