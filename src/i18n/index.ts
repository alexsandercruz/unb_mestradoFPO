import ptBR from './pt-BR.json';
import en from './en.json';

export type Locale = 'pt-BR' | 'en';
export type TranslationSchema = typeof ptBR;

const dictionaries: Record<Locale, TranslationSchema> = {
  'pt-BR': ptBR,
  en,
};

export function getDictionary(locale: Locale): TranslationSchema {
  return dictionaries[locale] ?? dictionaries['pt-BR'];
}

