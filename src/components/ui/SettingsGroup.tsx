import React from "react";

interface SettingsGroupProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
}

export const SettingsGroup: React.FC<SettingsGroupProps> = ({
  title,
  description,
  children,
}) => {
  return (
    <section className="card-border bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col">
      {title && (
        <div className="px-5 py-3 border-b border-zinc-100 bg-zinc-50/50 rounded-t-[7px]">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
            {title}
          </h3>
          {description && (
            <p className="text-sm text-zinc-400 mt-1">{description}</p>
          )}
        </div>
      )}
      <div
        className={`divide-y divide-zinc-100 ${
          !title ? "[&>*:first-child]:rounded-t-[7px]" : ""
        } [&>*:last-child]:rounded-b-[7px]`}
      >
        {children}
      </div>
    </section>
  );
};
