import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const ToastContext = createContext({ push: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef();

  const push = useCallback((message, { duration = 3500 } = {}) => {
    clearTimeout(timer.current);
    setToast({ id: Math.random(), message });
    timer.current = setTimeout(() => setToast(null), duration);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);
  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
        {toast && (
          <div className="toast" key={toast.id}>
            <span aria-hidden="true">✓ </span>
            {toast.message}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
