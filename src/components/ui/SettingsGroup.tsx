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
    <section className="card-border bg-white overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      {title && (
        <div className="px-5 py-3 border-b border-zinc-100 bg-zinc-50/50">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
            {title}
          </h3>
          {description && (
            <p className="text-sm text-zinc-400 mt-1">{description}</p>
          )}
        </div>
      )}
      <div className="divide-y divide-zinc-100">{children}</div>
    </section>
  );
};
