import React from "react";

const HandyTextLogo = ({
  width,
  height,
  className,
}: {
  width?: number;
  height?: number;
  className?: string;
}) => {
  return (
    <svg
      width={width}
      height={height}
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M14 11V4a2 2 0 0 0-4 0v10.5l-2.6-2.6a2 2 0 0 0-2.8 2.8l5.4 5.4c.7.7 1.6 1.1 2.6 1.1h4c1.5 0 2.8-1.1 3-2.6l.7-4.9a3 3 0 0 0-2.2-3.3L14 11z"
        className="logo-primary"
        fill="currentColor"
        stroke="var(--color-logo-stroke)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
};

export default HandyTextLogo;
