-- Baseline: full schema snapshot of the current database state

-- CreateTable
CREATE TABLE `adminsettings` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `accessPin` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `apilog` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `provider` ENUM('PARCELHIVE', 'SQUARE') NOT NULL,
    `method` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `requestHeaders` LONGTEXT NULL,
    `requestBody` LONGTEXT NULL,
    `responseStatus` INTEGER NULL,
    `responseHeaders` LONGTEXT NULL,
    `responseBody` LONGTEXT NULL,
    `error` VARCHAR(191) NULL,
    `durationMs` INTEGER NULL,
    `orderId` VARCHAR(191) NULL,

    INDEX `ApiLog_orderId_fkey`(`orderId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `locker` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `lockerUid` VARCHAR(191) NOT NULL,
    `locationUid` VARCHAR(191) NOT NULL,
    `lockerNumber` VARCHAR(191) NULL,
    `isAvailable` BOOLEAN NOT NULL DEFAULT true,
    `lastSeenAt` DATETIME(3) NULL,

    UNIQUE INDEX `Locker_lockerUid_key`(`lockerUid` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `squareOrderId` VARCHAR(191) NOT NULL,
    `squareCustomerId` VARCHAR(191) NULL,
    `squareLocationId` VARCHAR(191) NULL,
    `squareOrderPayload` LONGTEXT NOT NULL,
    `status` ENUM('RECEIVED', 'SENT_TO_PARCELHIVE', 'LOCKER_ASSIGNED', 'STORE_PICKUP', 'FAILED') NOT NULL DEFAULT 'RECEIVED',
    `parcelHiveOrderId` VARCHAR(191) NULL,
    `integrationNumber` VARCHAR(191) NOT NULL,
    `parcelHiveLocation` VARCHAR(191) NULL,
    `depositPin` VARCHAR(191) NULL,
    `collectPin` VARCHAR(191) NULL,
    `lockerUid` VARCHAR(191) NULL,
    `lockerNumber` VARCHAR(191) NULL,
    `qrCode` VARCHAR(191) NULL,
    `recipientPhone` VARCHAR(191) NULL,
    `recipientEmail` VARCHAR(191) NULL,
    `startsAt` DATETIME(3) NULL,
    `endsAt` DATETIME(3) NULL,
    `lastError` VARCHAR(191) NULL,

    UNIQUE INDEX `Order_integrationNumber_key`(`integrationNumber` ASC),
    INDEX `Order_parcelHiveOrderId_idx`(`parcelHiveOrderId` ASC),
    UNIQUE INDEX `Order_squareOrderId_key`(`squareOrderId` ASC),
    INDEX `Order_status_idx`(`status` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `systemcontrol` (
    `id` INTEGER NOT NULL,
    `enabled` BOOLEAN NOT NULL,
    `reason` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `type` ENUM('MAIN', 'PARCELHIVE') NOT NULL,

    UNIQUE INDEX `systemcontrol_type_key`(`type` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webhooklog` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `provider` ENUM('PARCELHIVE', 'SQUARE') NOT NULL,
    `path` VARCHAR(191) NOT NULL,
    `headers` LONGTEXT NOT NULL,
    `body` LONGTEXT NULL,
    `rawBody` LONGTEXT NULL,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `verificationError` VARCHAR(191) NULL,
    `orderId` VARCHAR(191) NULL,

    INDEX `WebhookLog_orderId_fkey`(`orderId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `apilog` ADD CONSTRAINT `ApiLog_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `webhooklog` ADD CONSTRAINT `WebhookLog_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
