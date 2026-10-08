import "server-only";
import { google, type drive_v3 } from "googleapis";

export type DriveReportFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string | null;
};

function createDriveClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
    ?.replace(/\\n/g, "\n")
    .replace(/^['"]|['"]$/g, "");

  if (!email || !privateKey) {
    throw new Error(
      "Google Drive is not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.",
    );
  }

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return google.drive({ version: "v3", auth });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function driveErrorMessage(error: unknown) {
  const root = asRecord(error);
  const response = asRecord(root?.response);
  const responseData = asRecord(response?.data);
  const apiError = asRecord(responseData?.error);
  const oauthError = responseData?.error;
  const oauthDescription = responseData?.error_description;
  const reason =
    typeof apiError?.status === "string"
      ? apiError.status
      : typeof oauthError === "string"
      ? oauthError
      : typeof asRecord(oauthError)?.message === "string"
        ? String(asRecord(oauthError)?.message)
        : "";
  const description = typeof oauthDescription === "string" ? oauthDescription : "";
  const apiMessage = typeof apiError?.message === "string" ? apiError.message : "";
  const apiReasons = Array.isArray(apiError?.errors)
    ? apiError.errors
        .map((entry) => asRecord(entry)?.reason)
        .filter((entry): entry is string => typeof entry === "string")
    : [];
  const status = response?.status;

  if (
    apiReasons.includes("accessNotConfigured") ||
    /Google Drive API has not been used|Drive API.*disabled/i.test(apiMessage)
  ) {
    return "Google Drive API is disabled for the service account's Google Cloud project. Enable Google Drive API in the project linked to GOOGLE_SERVICE_ACCOUNT_EMAIL, wait a few minutes for activation, and retry the sync.";
  }
  if (
    reason === "invalid_grant" &&
    /account not found/i.test(description)
  ) {
    return "Google rejected the service-account identity: account not found. Set GOOGLE_SERVICE_ACCOUNT_EMAIL to the client_email from the same active service-account JSON as GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, then restart the server.";
  }
  if (reason === "invalid_grant") {
    return "Google rejected the service-account credentials (invalid_grant). Confirm the service-account email and private key come from the same active JSON key, and check that the server clock is correct.";
  }
  if (status === 401 || status === 403) {
    return "Google Drive denied access. Confirm the Drive API is enabled and share the configured folder with the service-account email.";
  }
  if (status === 404) {
    return "Google Drive could not find the configured folder or file. Verify GOOGLE_DRIVE_FOLDER_ID and that the service account can access it.";
  }
  if (status === 429 || (typeof status === "number" && status >= 500)) {
    return "Google Drive is temporarily unavailable or rate-limited. Wait briefly and retry the sync.";
  }
  if (typeof status === "number") {
    return `Google Drive request failed with HTTP ${status}. Verify the service-account configuration, Drive API access, and folder permissions.`;
  }

  return "Google Drive request failed before receiving an API response. Check the service-account configuration and network connection.";
}

async function withDriveErrorContext<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new Error(driveErrorMessage(error), { cause: error });
  }
}

function decodeCsv(bytes: Buffer) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.subarray(2).toString("utf16le");
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return Buffer.from(bytes.subarray(2)).swap16().toString("utf16le");
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.subarray(3).toString("utf8");
  }

  const sampleLength = Math.min(bytes.length, 128);
  let evenNulls = 0;
  let oddNulls = 0;
  for (let index = 0; index < sampleLength; index++) {
    if (bytes[index] === 0) {
      if (index % 2 === 0) evenNulls++;
      else oddNulls++;
    }
  }
  const nullThreshold = Math.floor(sampleLength / 8);
  if (oddNulls > nullThreshold) return bytes.toString("utf16le");
  if (evenNulls > nullThreshold) {
    return Buffer.from(bytes).swap16().toString("utf16le");
  }
  return bytes.toString("utf8");
}

export async function listReportFiles(folderId: string): Promise<DriveReportFile[]> {
  const drive = createDriveClient();
  const files: DriveReportFile[] = [];
  let pageToken: string | undefined;

  do {
    const response = await withDriveErrorContext(() =>
      drive.files.list({
        q: `'${folderId.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' in parents and trashed = false`,
        pageSize: 1000,
        pageToken,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        fields: "nextPageToken,files(id,name,mimeType,size)",
        orderBy: "name",
      }),
    );

    for (const file of response.data.files ?? []) {
      if (!file.id || !file.name) continue;
      files.push({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType ?? "application/octet-stream",
        size: file.size,
      });
    }
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return files;
}

export async function downloadCsv(fileId: string) {
  const drive = createDriveClient();
  const response = await withDriveErrorContext(() =>
    drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" },
    ),
  );
  return decodeCsv(Buffer.from(response.data as ArrayBuffer));
}

export async function markDriveFileProcessed(file: DriveReportFile) {
  const drive: drive_v3.Drive = createDriveClient();
  const name = file.name.replace(/\.csv$/i, "");
  await withDriveErrorContext(() =>
    drive.files.update({
      fileId: file.id,
      supportsAllDrives: true,
      requestBody: { name: `${name}_processed.csv` },
    }),
  );
}
