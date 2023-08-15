-- CreateTable
CREATE TABLE "OauthToken" (
    "refreshToken" TEXT NOT NULL PRIMARY KEY,
    "accessToken" TEXT NOT NULL,
    "expiration" DATETIME
);
