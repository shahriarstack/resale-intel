import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    
    const cost = await prisma.costAnalysis.upsert({
      where: { vehicleId: id },
      update: {
        repairCosts: body.repairCost !== undefined ? body.repairCost : undefined,
        transportCosts: body.transportCost !== undefined ? body.transportCost : undefined,
        registrationCost: body.registrationCost !== undefined ? body.registrationCost : undefined,
        sopCost: body.sopCost !== undefined ? body.sopCost : undefined,
        proposedPrice: body.proposedPrice !== undefined ? body.proposedPrice : undefined,
        approvedPrice: body.approvedPrice !== undefined ? body.approvedPrice : undefined,
      },
      create: {
        vehicleId: id,
        repairCosts: body.repairCost || 0,
        transportCosts: body.transportCost || 0,
        registrationCost: body.registrationCost || 0,
        sopCost: body.sopCost || 0,
        proposedPrice: body.proposedPrice || null,
        approvedPrice: body.approvedPrice || null,
      }
    });

    return NextResponse.json({ success: true, data: cost });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
