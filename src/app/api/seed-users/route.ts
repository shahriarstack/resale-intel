import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const demoUsers = [
      { id: 'aro-001', name: 'John Doe (ARO)', staffId: 'ARO-01', employeeId: 'aro123', password: 'password', role: 'RECOVERY_TEAM', area: 'Dhaka' },
      { id: 'se-001', name: 'Jane Smith (SE)', staffId: 'SE-01', employeeId: 'se123', password: 'password', role: 'SERVICE_ENGINEER', area: 'Dhaka' },
      { id: 'sh-001', name: 'Bob Head (Service Head)', staffId: 'SH-01', employeeId: 'sh123', password: 'password', role: 'SERVICE_HEAD', area: 'HQ' },
      { id: 'reg-001', name: 'Alice Reg (Registration)', staffId: 'REG-01', employeeId: 'reg123', password: 'password', role: 'REGISTRATION_TEAM', area: 'HQ' },
      { id: 'exec-001', name: 'Tom Exec (Sr Exec)', staffId: 'EXEC-01', employeeId: 'exec123', password: 'password', role: 'SR_EXECUTIVE', area: 'HQ' },
      { id: 'agm-001', name: 'Sarah Boss (AGM)', staffId: 'AGM-01', employeeId: 'agm123', password: 'password', role: 'AGM_DGM', area: 'HQ' },
      { id: 'sales-001', name: 'Mike Seller (Sales)', staffId: 'SALES-01', employeeId: 'sales123', password: 'password', role: 'SALES_TEAM', area: 'Dhaka' }
    ];

    for (const user of demoUsers) {
      await prisma.user.upsert({
        where: { id: user.id },
        update: {},
        create: user as any
      });
    }

    return NextResponse.json({ success: true, message: 'Demo users seeded successfully' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
