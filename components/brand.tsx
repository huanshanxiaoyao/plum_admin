import { Leaf } from "lucide-react";
import styles from "./brand.module.css";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={styles.brand} aria-label="Plum Admin">
      <span className={styles.mark} aria-hidden="true">
        <Leaf size={18} strokeWidth={2.2} />
      </span>
      {!compact && (
        <span className={styles.name}>
          Plum <b>Admin</b>
        </span>
      )}
    </span>
  );
}
