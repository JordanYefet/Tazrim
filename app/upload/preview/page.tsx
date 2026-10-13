import { redirect } from 'next/navigation'

// The raw-grid preview is now step 2-3 of /upload.
export default function UploadPreviewRedirect() {
  redirect('/upload')
}
