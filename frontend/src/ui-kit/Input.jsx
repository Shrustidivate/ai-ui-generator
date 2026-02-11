import styles from "./Input.module.css";

export default function Input({ label, placeholder, value }) {
  return (
    <label className={styles.wrapper}>
      {label ? <span className={styles.label}>{label}</span> : null}
      <input
        className={styles.input}
        placeholder={placeholder}
        defaultValue={value}
        readOnly={Boolean(value)}
      />
    </label>
  );
}