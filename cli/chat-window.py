# `kaizen chat`'s window: a see-through WebKitGTK window, so the popup shows
# only its bubbles over the desktop. Chromium app windows always paint a
# background; this is used when python3 has GTK 3 and WebKit2GTK 4.1.
import sys
import gi
gi.require_version("Gtk", "3.0")
gi.require_version("Gdk", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import GLib, Gdk, Gtk, WebKit2

if len(sys.argv) > 1 and sys.argv[1] == "--check":
    sys.exit(0)
GLib.set_prgname("kaizen-chat")
win = Gtk.Window(title="kaizen chat")
win.set_default_size(420, 600)
win.set_decorated(False)
win.set_app_paintable(True)
visual = win.get_screen().get_rgba_visual()
if visual:
    win.set_visual(visual)
view = WebKit2.WebView()
clear = Gdk.RGBA()
clear.parse("rgba(0,0,0,0)")
view.set_background_color(clear)
# The page's drag handle: the compositor moves the window while the button is held.
def on_message(_manager, _result):
    win.begin_move_drag(1, 0, 0, Gtk.get_current_event_time())
manager = view.get_user_content_manager()
manager.connect("script-message-received::kaizen", on_message)
manager.register_script_message_handler("kaizen")
# window.close() from the page (Esc) closes the window.
view.connect("close", lambda *_: win.destroy())
view.load_uri(sys.argv[1])
win.add(view)
win.connect("destroy", Gtk.main_quit)
win.show_all()
Gtk.main()
