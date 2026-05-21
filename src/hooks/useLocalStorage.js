import { useState } from 'react';

export function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = localStorage.getItem(key);
      return item !== null ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = (value) => {
    const valueToStore = typeof value === 'function' ? value(storedValue) : value;
    setStoredValue(valueToStore);
    try {
      localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch {}
  };

  return [storedValue, setValue];
}