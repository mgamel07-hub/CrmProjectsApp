import React, { createContext, useContext, useState } from 'react';
import { setLanguage, getLang } from '../i18n';

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLang] = useState(getLang());

  const switchLang = (newLang) => {
    setLanguage(newLang);
    setLang(newLang);
  };

  return (
    <LangContext.Provider value={{ lang, switchLang, isRTL: lang === 'ar' }}>
      {children}
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);
