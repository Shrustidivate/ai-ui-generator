import styles from "./Button.module.css";

export default function Button({ variant = "primary", children, onClick }) {
  const variantClass = styles[variant] || styles.primary;

  return (
    <button className={`${styles.button} ${variantClass}`} onClick={onClick}>
      {children}
    </button>
  );
}