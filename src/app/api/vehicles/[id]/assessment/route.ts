import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    
    // Validate we have URLs
    if (!body.urls || !Array.isArray(body.urls)) {
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
    }

    // Create media records for assessment images
    const mediaCreates = body.urls.map((url: string) => ({
      vehicleId: id,
      url: url,
      type: 'ASSESSMENT',
    }));

    await prisma.vehicleMedia.createMany({
      data: mediaCreates
    });

    return NextResponse.json({ success: true, data: { message: 'Assessment media uploaded' } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
