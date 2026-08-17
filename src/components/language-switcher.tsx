"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setUserLocale } from "@/lib/actions/locale";
import { SUPPORTED_LOCALES, type AppLocale } from "@/i18n/locales";
import { Languages } from "lucide-react";

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("settings");
  const [pending, startTransition] = useTransition();

  const optionLabel: Record<AppLocale, string> = {
    en: t("languageEnglish"),
    hi: t("languageHindi"),
  };

  function handleChange(next: string) {
    startTransition(async () => {
      try {
        await setUserLocale(next);
        // Full reload, not router.refresh(): the new locale must reach
        // NextIntlClientProvider in the ROOT layout, and a soft refresh
        // does not reliably re-render that far up the tree (confirmed
        // empirically — a hard reload always picks up the new DB value,
        // router.refresh() sometimes doesn't). Same reasoning as the
        // login form's post-sign-in redirect.
        window.location.reload();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not change language");
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <Languages className="h-4 w-4 text-muted-foreground" />
      <Select value={locale} onValueChange={handleChange} disabled={pending}>
        <SelectTrigger className="h-8 w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SUPPORTED_LOCALES.map((l) => (
            <SelectItem key={l} value={l}>
              {optionLabel[l]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
