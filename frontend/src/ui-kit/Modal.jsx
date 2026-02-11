import styles from "./Modal.module.css";

export default function Modal({ title, open = true, children }) {
  if (!open) {
    return null;
  }

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        {title ? <h3 className={styles.title}>{title}</h3> : null}
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}