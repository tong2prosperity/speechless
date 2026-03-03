import { listen } from "@tauri-apps/api/event";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MicrophoneIcon,
  TranscriptionIcon,
  CancelIcon,
} from "../components/icons";
import "./RecordingOverlay.css";
import { commands } from "@/bindings";
import i18n, { syncLanguageFromSettings } from "@/i18n";
import { getLanguageDirection } from "@/lib/utils/rtl";

type OverlayState = "recording" | "transcribing" | "processing";

const RecordingOverlay: React.FC = () => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [state, setState] = useState<OverlayState>("recording");
  const [levels, setLevels] = useState<number[]>(Array(32).fill(0));
  const smoothedLevelsRef = useRef<number[]>(Array(32).fill(0));
  const direction = getLanguageDirection(i18n.language);

  useEffect(() => {
    let unlistenShow: () => void;
    let unlistenHide: () => void;
    let unlistenLevel: () => void;

    const setupEventListeners = async () => {
      // Listen for show-overlay event from Rust
      unlistenShow = await listen("show-overlay", async (event) => {
        // Sync language from settings each time overlay is shown
        await syncLanguageFromSettings();
        const overlayState = event.payload as OverlayState;
        setState(overlayState);
        setIsVisible(true);
      });

      // Listen for hide-overlay event from Rust
      unlistenHide = await listen("hide-overlay", () => {
        setIsVisible(false);
      });

      // Listen for mic-level updates
      unlistenLevel = await listen<number[]>("mic-level", (event) => {
        const newLevels = event.payload as number[];

        // Apply smoothing to reduce jitter and carefully amplify
        const smoothed = smoothedLevelsRef.current.map((prev, i) => {
          const target = Math.min(1.0, (newLevels[i] || 0) * 1.5); // Amplify slightly for better UI visibility
          return prev * 0.5 + target * 0.5; // Make the UI transition slightly snappier
        });

        smoothedLevelsRef.current = smoothed;
        setLevels(smoothed.slice(0, 9));
      });
    };

    setupEventListeners();

    // Cleanup function
    return () => {
      if (unlistenShow) unlistenShow();
      if (unlistenHide) unlistenHide();
      if (unlistenLevel) unlistenLevel();
    };
  }, []);

  const getIcon = () => {
    if (state === "recording") {
      return <MicrophoneIcon width={18} height={18} color="#111827" />;
    }
    return <TranscriptionIcon width={18} height={18} color="#111827" />;
  };

  const getStateText = () => {
    if (state === "recording") {
      return t("overlay.recording", { defaultValue: "Listening..." });
    }
    if (state === "processing") return t("overlay.processing");
    return t("overlay.transcribing");
  };

  return (
    <div
      dir={direction}
      className={`recording-overlay ${isVisible ? "fade-in" : ""}`}
    >
      <div className="overlay-left">
        <div className="state-icon">{getIcon()}</div>
      </div>

      <div className="overlay-middle">
        <div className="state-text">
          <span
            className={`state-dot ${state === "recording" ? "active" : ""}`}
          />
          <span>{getStateText()}</span>
        </div>
        {state === "recording" && (
          <div className="bars-container">
            {levels.map((v, i) => (
              <div
                key={i}
                className="bar"
                style={{
                  height: `${Math.min(24, 4 + Math.pow(v, 0.6) * 20)}px`, // Increase max height slightly and use stronger curve
                  transition:
                    "height 60ms cubic-bezier(0.4, 0, 0.2, 1), opacity 120ms ease-out", // Snappier bezier curve
                  opacity: Math.max(0.3, 0.3 + v * 1.4), // Minimum opacity for visibility scaled properly
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="overlay-right">
        {state === "recording" && (
          <button
            type="button"
            className="cancel-button"
            onClick={() => {
              commands.cancelOperation();
            }}
          >
            <CancelIcon width={18} height={18} color="#52525B" />
          </button>
        )}
      </div>
    </div>
  );
};

export default RecordingOverlay;
