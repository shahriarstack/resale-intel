import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    
    // Do not allow updating ID directly from body, only through params
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        name: body.name,
        staffId: body.staffId,
        employeeId: body.employeeId,
        password: body.password,
        area: body.area,
        role: body.role,
      }
    });

    return NextResponse.json({ success: true, data: updatedUser });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'Staff ID or Employee ID already exists' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    
    // Prevent deleting the very last SUPER_ADMIN to avoid locking out
    const userToDelete = await prisma.user.findUnique({ where: { id } });
    if (userToDelete?.role === 'SUPER_ADMIN') {
      const superAdminsCount = await prisma.user.count({ where: { role: 'SUPER_ADMIN' } });
      if (superAdminsCount <= 1) {
        return NextResponse.json({ success: false, error: 'Cannot delete the last Super Admin' }, { status: 400 });
      }
    }

    await prisma.user.delete({
      where: { id }
    });

    return NextResponse.json({ success: true, message: 'User deleted successfully' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
