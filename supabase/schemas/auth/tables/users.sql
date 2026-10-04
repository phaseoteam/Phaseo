CREATE TRIGGER on_auth_user_created_enqueue_welcome
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_created();
