import { v2 as cloudinary } from "cloudinary";

function requireCloudinaryEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

export function isCloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME?.trim() &&
      process.env.CLOUDINARY_API_KEY?.trim() &&
      process.env.CLOUDINARY_API_SECRET?.trim(),
  );
}

function configureCloudinary() {
  cloudinary.config({
    cloud_name: requireCloudinaryEnv("CLOUDINARY_CLOUD_NAME"),
    api_key: requireCloudinaryEnv("CLOUDINARY_API_KEY"),
    api_secret: requireCloudinaryEnv("CLOUDINARY_API_SECRET"),
    secure: true,
  });
}

export async function uploadBusinessLogo(dataUri: string, businessId: number) {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      "Logo upload is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
    );
  }

  configureCloudinary();

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: `icecream/logos/${businessId}`,
    public_id: "logo",
    overwrite: true,
    invalidate: true,
    resource_type: "image",
    transformation: [
      { width: 512, height: 512, crop: "limit" },
      { quality: "auto:good" },
    ],
  });

  if (!result.secure_url) {
    throw new Error("Cloudinary upload failed");
  }

  return {
    url: result.secure_url as string,
    publicId: result.public_id as string,
  };
}

export async function deleteBusinessLogo(publicId: string) {
  if (!isCloudinaryConfigured()) return;
  configureCloudinary();
  try {
    await cloudinary.uploader.destroy(publicId, { invalidate: true });
  } catch {
    // Best-effort cleanup
  }
}
