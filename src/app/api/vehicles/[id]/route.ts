import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: {
        capturedBy: { select: { name: true } },
        assignedEngineer: { select: { name: true } },
        media: true,
        documents: true,
        costAnalysis: true
      }
    });

    if (!vehicle) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: vehicle });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Global update route for changing status, SLA, etc.
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    
    const updateData: any = {};
    if (body.status) updateData.status = body.status;
    if (body.repairDeadline) updateData.repairDeadline = new Date(body.repairDeadline);
    if (body.deadlineFlagged !== undefined) updateData.deadlineFlagged = body.deadlineFlagged;

    const vehicle = await prisma.vehicle.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json({ success: true, data: vehicle });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
