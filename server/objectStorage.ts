import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";
import { randomUUID } from "crypto";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    // URL-decode the path to handle spaces and special characters
    const decodedPath = decodeURIComponent(objectPath);
    
    const parts = decodedPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  async downloadObject(file: File, res: Response, cacheTtlSec: number = 3600) {
    try {
      const [metadata] = await file.getMetadata();
      
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `private, max-age=${cacheTtlSec}`,
      });

      const stream = file.createReadStream();

      stream.on("error", (err: Error) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  async downloadFile(fileKey: string): Promise<Buffer> {
    try {
      const file = await this.getObjectEntityFile(fileKey);
      const stream = file.createReadStream();
      
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      
      return Buffer.concat(chunks);
    } catch (error) {
      console.error('[downloadFile] Error:', error);
      throw error;
    }
  }

  async uploadFile(buffer: Buffer, fileName: string): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/templates/${objectId}-${fileName}`;

    console.log('[UPLOAD_STORAGE] Uploading file:');
    console.log('[UPLOAD_STORAGE] - fileName:', fileName);
    console.log('[UPLOAD_STORAGE] - privateObjectDir:', privateObjectDir);
    console.log('[UPLOAD_STORAGE] - fullPath:', fullPath);

    const { bucketName, objectName } = parseObjectPath(fullPath);
    console.log('[UPLOAD_STORAGE] - bucketName:', bucketName);
    console.log('[UPLOAD_STORAGE] - objectName:', objectName);
    
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);

    await file.save(buffer, {
      contentType: getContentType(fileName),
    });
    
    // Verify upload
    const [exists] = await file.exists();
    console.log('[UPLOAD_STORAGE] - file exists after upload:', exists);

    return `/objects/templates/${objectId}-${fileName}`;
  }

  async deleteFile(fileKey: string): Promise<void> {
    if (!fileKey) {
      console.log('[DELETE_STORAGE] No file key provided, skipping deletion');
      return;
    }

    try {
      const privateObjectDir = this.getPrivateObjectDir();
      const fullPath = `${privateObjectDir}/${fileKey}`;

      console.log('[DELETE_STORAGE] Deleting file:');
      console.log('[DELETE_STORAGE] - fileKey:', fileKey);
      console.log('[DELETE_STORAGE] - fullPath:', fullPath);

      const { bucketName, objectName } = parseObjectPath(fullPath);
      console.log('[DELETE_STORAGE] - bucketName:', bucketName);
      console.log('[DELETE_STORAGE] - objectName:', objectName);
      
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      const [exists] = await file.exists();
      if (!exists) {
        console.log('[DELETE_STORAGE] - file does not exist, skipping deletion');
        return;
      }

      await file.delete();
      console.log('[DELETE_STORAGE] - file deleted successfully');
    } catch (error) {
      console.error('[DELETE_STORAGE] Error deleting file:', error);
      throw error;
    }
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

function getContentType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    'pdf': 'application/pdf',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'doc': 'application/msword',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'xls': 'application/vnd.ms-excel',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}
