import React, { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";

import ModelSelector from "../model-selector";
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
        <div className="flex items-center gap-2 cursor-pointer hover:text-zinc-900 transition-colors">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
          <ModelSelector />
          <span className="material-symbols-outlined text-[14px]">
            expand_less
          </span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <UpdateChecker />
        <span className="font-mono text-zinc-400">v{version}</span>
      </div>
    </footer>
  );
};

export default Footer;
