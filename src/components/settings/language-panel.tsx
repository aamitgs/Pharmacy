"use client";

import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/language-switcher";

export function LanguagePanel() {
  const t = useTranslations("settings");

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-sm font-medium">{t("languageTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("languageDescription")}</p>
      </div>
      <LanguageSwitcher />
    </div>
  );
}
