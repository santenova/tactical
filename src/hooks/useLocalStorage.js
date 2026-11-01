import { useState, useRef, useCallback } from 'react';

export function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = localStorage.getItem(key);
      return item !== null ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  // Function updaters read the newest value, even from a callback created in an older render
  const valueRef = useRef(storedValue);
  valueRef.current = storedValue;

  const setValue = useCallback((value) => {
    const valueToStore = typeof value === 'function' ? value(valueRef.current) : value;
    valueRef.current = valueToStore;
    setStoredValue(valueToStore);
    try {
      localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch {}
  }, [key]);

  return [storedValue, setValue];
}