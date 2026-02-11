import styles from "./Chart.module.css";

const mockData = [
  { label: "Mon", value: 28, level: 2 },
  { label: "Tue", value: 54, level: 4 },
  { label: "Wed", value: 42, level: 3 },
  { label: "Thu", value: 70, level: 5 },
  { label: "Fri", value: 60, level: 4 }
];

export default function Chart({ title }) {
  return (
    <div className={styles.chart}>
      {title ? <h3 className={styles.title}>{title}</h3> : null}
      <div className={styles.bars}>
        {mockData.map((item) => (
          <div key={item.label} className={styles.barWrapper}>
            <div className={`${styles.bar} ${styles[`level${item.level}`]}`} />
            <span className={styles.label}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}