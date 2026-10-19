import { Directory, File, Paths } from 'expo-file-system';

/** Native: copy the picked photo into the app's documents folder and return its file uri. */
export async function persistPhoto(uri: string): Promise<string> {
  const dir = new Directory(Paths.document, 'photos');
  dir.create({ idempotent: true, intermediates: true });
  const src = new File(uri);
  const dest = new File(dir, `${Date.now()}-${src.name || 'photo.jpg'}`);
  await src.copy(dest);
  return dest.uri;
}
