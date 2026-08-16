import React from 'react';
import styles from './DataTable.module.css';

interface TableData {
  id: string;
  vehicle: string;
  vin: string;
  cost: number;
  status: 'Approved' | 'Pending' | 'Rejected';
  date: string;
}

const MOCK_DATA: TableData[] = [
  { id: '1', vehicle: '2022 Tesla Model 3', vin: '5YJ3E1EA5NFXXXXXX', cost: 35000, status: 'Approved', date: '2026-08-15' },
  { id: '2', vehicle: '2021 BMW M3', vin: 'WBS33BG05NXXXXXXX', cost: 65000, status: 'Pending', date: '2026-08-16' },
  { id: '3', vehicle: '2023 Porsche 911', vin: 'WP0AA2996NSXXXXXX', cost: 120000, status: 'Approved', date: '2026-08-14' },
  { id: '4', vehicle: '2020 Audi RS5', vin: 'WAUUBG8T2LAXXXXXX', cost: 55000, status: 'Rejected', date: '2026-08-12' },
  { id: '5', vehicle: '2024 Mercedes-Benz S-Class', vin: 'W1N2231631AXXXXXX', cost: 110000, status: 'Pending', date: '2026-08-16' },
];

export default function DataTable() {
  const getStatusClass = (status: string) => {
    switch (status) {
      case 'Approved': return styles.statusApproved;
      case 'Pending': return styles.statusPending;
      case 'Rejected': return styles.statusRejected;
      default: return '';
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.title}>Recent Inventory Acquisitions</div>
        <div className={styles.actions}>
          <button className={styles.btn}>Export CSV</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`}>Add Vehicle</button>
        </div>
      </div>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Vehicle</th>
              <th className={styles.th}>VIN</th>
              <th className={styles.th}>Cost</th>
              <th className={styles.th}>Status</th>
              <th className={styles.th}>Date added</th>
              <th className={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_DATA.map((row) => (
              <tr key={row.id} className={styles.tr}>
                <td className={styles.td}><strong>{row.vehicle}</strong></td>
                <td className={styles.td}>{row.vin}</td>
                <td className={styles.td}>${row.cost.toLocaleString()}</td>
                <td className={styles.td}>
                  <span className={`${styles.status} ${getStatusClass(row.status)}`}>
                    {row.status}
                  </span>
                </td>
                <td className={styles.td}>{row.date}</td>
                <td className={styles.td}>
                  <button className={styles.btn} style={{ padding: '4px 8px', fontSize: '12px' }}>Review</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
