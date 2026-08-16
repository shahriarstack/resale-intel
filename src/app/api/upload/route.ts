import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // We will save to public/uploads directory.
    // In a production environment with standalone mode, you may want to configure 
    // persistent storage outside the deployment folder or use a cloud provider.
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    
    // Ensure the uploads directory exists
    try {
      await fs.access(uploadsDir);
    } catch {
      await fs.mkdir(uploadsDir, { recursive: true });
    }

    // Generate unique filename
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const filename = `${type || 'media'}-${uniqueSuffix}${path.extname(file.name)}`;
    const filePath = path.join(uploadsDir, filename);

    // Save the file
    await fs.writeFile(filePath, buffer);

    // Return the public URL for the file
    return NextResponse.json({ 
      success: true, 
      url: `/uploads/${filename}`,
      filename: filename
    });

  } catch (error: any) {
    console.error('Upload Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
