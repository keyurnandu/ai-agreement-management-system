/** Max accepted upload size (bytes) for PDF endpoints — bounds memory use on
 * the buffer-the-whole-file upload paths (incl. the public vendor endpoint). */
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024; // 30 MB
