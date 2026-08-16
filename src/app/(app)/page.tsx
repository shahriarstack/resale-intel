import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Welcome back, {session?.user?.name || 'User'}</h1>
        <p>Here is your commercial vehicle recovery & resale overview.</p>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Seized Vehicles</h3>
          <div className="value">124 vehicles</div>
        </div>
        <div className="stat-card">
          <h3>Live For Resale</h3>
          <div className="value">89 vehicles</div>
        </div>
        <div className="stat-card">
          <h3>Monthly Sales</h3>
          <div className="value">৳ 24,500,000</div>
        </div>
        <div className="stat-card">
          <h3>Net Recovery Value</h3>
          <div className="value text-success">+৳ 11,200,000</div>
        </div>
      </div>

      <div className="recent-activity">
        <h2>Recent Recovery Activity</h2>
        <div className="activity-list">
          <div className="activity-item">
            <div className="activity-icon">💰</div>
            <div className="activity-details">
              <h4>Resold: Foton Aumark S</h4>
              <p>Branch: Dhaka • ৳ 1,500,000</p>
            </div>
            <div className="activity-time">2h ago</div>
          </div>
          <div className="activity-item">
            <div className="activity-icon">🚨</div>
            <div className="activity-details">
              <h4>Seized: Mahindra Bolero Pik-Up</h4>
              <p>Outstanding EMI: ৳ 110,000</p>
            </div>
            <div className="activity-time">5h ago</div>
          </div>
          <div className="activity-item">
            <div className="activity-icon">📝</div>
            <div className="activity-details">
              <h4>Listed for Resale: Foton Tunland</h4>
              <p>Status: Live • ৳ 800,000</p>
            </div>
            <div className="activity-time">1d ago</div>
          </div>
        </div>
      </div>
    </div>
  );
}
