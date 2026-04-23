-- Allow authenticated users (students) to read approved content submissions
CREATE POLICY "Students read approved submissions"
  ON public.content_submissions
  FOR SELECT
  TO authenticated
  USING (status = 'approved');

-- Allow authenticated users (students) to read files from approved submissions
CREATE POLICY "Students read approved submission files"
  ON public.submission_files
  FOR SELECT
  TO authenticated
  USING (
    submission_id IN (
      SELECT id FROM public.content_submissions WHERE status = 'approved'
    )
  );
