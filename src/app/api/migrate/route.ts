import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: Request) {
  try {
    // Drop existing tables to start fresh
    await prisma.$executeRawUnsafe(`SET FOREIGN_KEY_CHECKS = 0;`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS CostAnalysis;`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS VehicleImage;`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS VehicleMedia;`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS VehicleDocument;`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS Vehicle;`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS Account;`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS Session;`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS VerificationToken;`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS User;`);
    
    // Create User Table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE User (
        id VARCHAR(191) NOT NULL,
        name VARCHAR(191),
        staffId VARCHAR(191) UNIQUE,
        employeeId VARCHAR(191) UNIQUE,
        password VARCHAR(191),
        area VARCHAR(191),
        role ENUM('SUPER_ADMIN', 'RECOVERY_TEAM', 'RECOVERY_MANAGER', 'SERVICE_ENGINEER', 'SERVICE_HEAD', 'REGISTRATION_TEAM', 'SR_EXECUTIVE', 'AGM_DGM', 'GM_SR_GM', 'SALES_TEAM') NOT NULL DEFAULT 'RECOVERY_TEAM',
        PRIMARY KEY (id)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    // Create Vehicle Table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE Vehicle (
        id VARCHAR(191) NOT NULL,
        customerCode VARCHAR(191),
        customerName VARCHAR(191),
        make VARCHAR(191),
        model VARCHAR(191),
        year INT,
        registrationNo VARCHAR(191) UNIQUE,
        mileage VARCHAR(191),
        territory VARCHAR(191),
        status ENUM('CAPTURED', 'ASSESSMENT_PENDING', 'CN_REQUESTED', 'CN_APPROVED', 'COST_ANALYSIS_SUBMITTED', 'REPAIR_APPROVED', 'REGISTRATION_COST_ADDED', 'SOP_COST_ADDED', 'PRICE_APPROVED', 'LIVE_FOR_RESALE', 'SOLD') NOT NULL DEFAULT 'CAPTURED',
        captureDate DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        capturedLoc VARCHAR(191),
        currentLoc VARCHAR(191),
        letterStatus ENUM('LETTER_1', 'LETTER_2', 'LETTER_3', 'WRITTEN', 'RELEASED', 'REQ_CN'),
        repairDeadline DATETIME(3),
        deadlineFlagged BOOLEAN NOT NULL DEFAULT false,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) NOT NULL,
        capturedById VARCHAR(191),
        assignedEngineerId VARCHAR(191),
        PRIMARY KEY (id),
        FOREIGN KEY (capturedById) REFERENCES User(id) ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY (assignedEngineerId) REFERENCES User(id) ON DELETE SET NULL ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    // Create VehicleDocument Table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE VehicleDocument (
        id VARCHAR(191) NOT NULL,
        vehicleId VARCHAR(191) NOT NULL UNIQUE,
        hasRegistrationCert BOOLEAN NOT NULL DEFAULT false,
        remarks TEXT,
        PRIMARY KEY (id),
        FOREIGN KEY (vehicleId) REFERENCES Vehicle(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    // Create VehicleMedia Table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE VehicleMedia (
        id VARCHAR(191) NOT NULL,
        vehicleId VARCHAR(191) NOT NULL,
        url VARCHAR(191) NOT NULL,
        type VARCHAR(191) NOT NULL,
        uploadedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        FOREIGN KEY (vehicleId) REFERENCES Vehicle(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    // Create CostAnalysis Table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE CostAnalysis (
        id VARCHAR(191) NOT NULL,
        vehicleId VARCHAR(191) NOT NULL UNIQUE,
        repairCosts DOUBLE NOT NULL DEFAULT 0,
        transportCosts DOUBLE NOT NULL DEFAULT 0,
        otherCosts DOUBLE NOT NULL DEFAULT 0,
        registrationCost DOUBLE NOT NULL DEFAULT 0,
        sopCost DOUBLE NOT NULL DEFAULT 0,
        isRepairApproved BOOLEAN NOT NULL DEFAULT false,
        proposedPrice DOUBLE,
        approvedPrice DOUBLE,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY (vehicleId) REFERENCES Vehicle(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    // Seed initial Super Admin
    await prisma.$executeRawUnsafe(`
      INSERT INTO User (id, name, staffId, employeeId, password, role) 
      VALUES ('admin-001', 'Super Admin', 'ADMIN-01', 'admin123', 'admin', 'SUPER_ADMIN');
    `);

    await prisma.$executeRawUnsafe(`SET FOREIGN_KEY_CHECKS = 1;`);

    return NextResponse.json({ success: true, message: 'Database migrated and seeded successfully.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
