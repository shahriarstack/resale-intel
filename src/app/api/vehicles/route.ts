import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';

const prisma = new PrismaClient();

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userRole = (session.user as any).role;
    const userId = (session.user as any).id;

    // Build the query based on role visibility
    let whereClause = {};

    if (userRole === 'RECOVERY_TEAM') {
      whereClause = { capturedById: userId };
    } else if (userRole === 'SERVICE_ENGINEER') {
      whereClause = { assignedEngineerId: userId };
    } 
    // Managers, Service Head, Registration, Executives see all vehicles (or filter by territory if needed)

    const vehicles = await prisma.vehicle.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        capturedBy: { select: { name: true } },
        assignedEngineer: { select: { name: true } },
      }
    });

    return NextResponse.json({ success: true, data: vehicles });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
