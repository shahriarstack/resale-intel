import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Welcome back, {session?.user?.name || 'User'}</h1>
        <p>Here is your reselling overview.</p>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Inventory</h3>
          <div className="value">124 items</div>
        </div>
        <div className="stat-card">
          <h3>Active Listings</h3>
          <div className="value">89 items</div>
        </div>
        <div className="stat-card">
          <h3>Monthly Sales</h3>
          <div className="value">$2,450.00</div>
        </div>
        <div className="stat-card">
          <h3>Net Profit</h3>
          <div className="value text-success">+$1,120.00</div>
        </div>
      </div>

      <div className="recent-activity">
        <h2>Recent Activity</h2>
        <div className="activity-list">
          <div className="activity-item">
            <div className="activity-icon">💰</div>
            <div className="activity-details">
              <h4>Sold: Vintage Leather Jacket</h4>
              <p>Platform: Grailed • $150.00</p>
            </div>
            <div className="activity-time">2h ago</div>
          </div>
          <div className="activity-item">
            <div className="activity-icon">📦</div>
            <div className="activity-details">
              <h4>Added: Nike Dunk Low</h4>
              <p>Cost: $110.00</p>
            </div>
            <div className="activity-time">5h ago</div>
          </div>
          <div className="activity-item">
            <div className="activity-icon">📝</div>
            <div className="activity-details">
              <h4>Listed: Sony Walkman</h4>
              <p>Platform: eBay • $80.00</p>
            </div>
            <div className="activity-time">1d ago</div>
          </div>
        </div>
      </div>
    </div>
  );
}
