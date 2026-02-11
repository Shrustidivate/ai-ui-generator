import styles from "./Navbar.module.css";

export default function Navbar({ title, links = [] }) {
  return (
    <nav className={styles.navbar}>
      <div className={styles.title}>{title}</div>
      <div className={styles.links}>
        {links.map((link) => (
          <span key={link} className={styles.link}>
            {link}
          </span>
        ))}
      </div>
    </nav>
  );
}