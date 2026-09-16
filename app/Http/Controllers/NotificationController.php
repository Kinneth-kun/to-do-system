<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request)
    {
        $notifications = $request->user()->notifications()->with(['actor', 'subject'])->paginate(20)->withQueryString();

        return view('notifications.index', compact('notifications'));
    }

    public function recent(Request $request): JsonResponse
    {
        $notifications = $request->user()->notifications()->with('actor')->limit(10)->get();

        return response()->json([
            'unread_count' => $request->user()->unreadNotifications()->count(),
            'data' => $notifications->map(fn (Notification $notification) => [
                'id' => $notification->id,
                'type' => $notification->type->value,
                'title' => $notification->title,
                'message' => $notification->message,
                'icon' => $notification->type->icon(),
                'color' => $notification->type->color(),
                'read' => $notification->isRead(),
                'time' => $notification->created_at?->diffForHumans(),
                'open_url' => route('notifications.open', $notification),
                'actor' => $notification->actor ? ['name' => $notification->actor->name, 'initials' => $notification->actor->initials(), 'avatar_color' => $notification->actor->avatar_color] : null,
            ])->values(),
        ]);
    }

    public function open(Request $request, Notification $notification): RedirectResponse
    {
        abort_unless($notification->user_id === $request->user()->id, 404);
        $notification->markAsRead();

        return redirect()->to($notification->url ?: route('notifications.index'));
    }

    public function markRead(Request $request, Notification $notification): RedirectResponse
    {
        abort_unless($notification->user_id === $request->user()->id, 404);
        $notification->markAsRead();

        return back()->with('success', 'Notification marked as read.');
    }

    public function markAllRead(Request $request): RedirectResponse
    {
        $request->user()->unreadNotifications()->update(['read_at' => now()]);

        return back()->with('success', 'All notifications marked as read.');
    }
}
