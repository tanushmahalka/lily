import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Toast } from "../kit/halaska-kit";

type Variant = "default" | "success" | "warning" | "danger";
type Item = { id: number; message: string; variant: Variant };
const Ctx = createContext<(message: string, variant?: Variant) => void>(() => {});

export function ToastHost({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const show = useCallback((message: string, variant: Variant = "default") => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, message, variant }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 20000, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
        <AnimatePresence>
          {items.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
              <Toast message={t.message} variant={t.variant} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
