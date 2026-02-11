import styles from "./Sidebar.module.css";

export default function Sidebar({ title, items = [] }) {
  return (
    <aside className={styles.sidebar}>
      {title ? <h3 className={styles.title}>{title}</h3> : null}
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item} className={styles.item}>
            {item}
          </li>
        ))}
      </ul>
    </aside>
  );
}