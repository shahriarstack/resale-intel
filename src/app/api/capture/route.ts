import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Create the vehicle with nested creations for Document and Media
    const vehicle = await prisma.vehicle.create({
      data: {
        customerCode: body.customerCode,
        customerName: body.customerName,
        make: body.make,
        model: body.model,
        year: body.year ? parseInt(body.year) : null,
        registrationNo: body.registrationNo,
        mileage: body.mileage,
        territory: body.territory,
        capturedLoc: body.capturedLoc,
        currentLoc: body.currentLoc,
        letterStatus: body.letterStatus,
        assignedEngineerId: body.assignedEngineerId,
        capturedById: body.capturedById, // Passed from frontend session
        status: 'CAPTURED',
        
        documents: {
          create: {
            hasRegistrationCert: body.hasRegistrationCert || false,
            remarks: body.remarks || '',
          }
        },
        
        media: {
          create: body.media.map((img: any) => ({
            url: img.url,
            type: img.type
          }))
        }
      }
    });

    return NextResponse.json({ success: true, data: vehicle });

  } catch (error: any) {
    console.error('Capture API Error:', error);
    if (error.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'Registration Number must be unique.' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
