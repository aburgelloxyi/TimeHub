import { useState, useEffect, useMemo } from "react";
import { setWrikeUserId } from "../lib/supabaseClient";

/**
 * Fetches the current Wrike user from the personal token in localStorage.
 * Also provides handleFetchLifetimeStats and the derived task counts.
 */
export function useWrikeUser(wrikeData, triggerToast) {
  const [wrikeUser, setWrikeUser] = useState(null);
  const [userStats, setUserStats] = useState({
    month: 0,
    year: 0,
    allTime: 0,
    loading: false,
    fetched: false,
  });

  useEffect(() => {
    const token = localStorage.getItem("wrike_personal_token");
    if (token && !wrikeUser) {
      fetch("https://www.wrike.com/api/v4/contacts?me=true", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Wrike API error ${res.status}`);
          return res.json();
        })
        .then((json) => {
          if (json.data?.length > 0) {
            const { id, firstName, lastName, profiles, avatarUrl } =
              json.data[0]; // ← update destructure
            setWrikeUser({ id, firstName });
            setWrikeUserId(id, {
              firstName,
              lastName,
              email: profiles?.[0]?.email,
              avatarUrl,
            }); // ← pass profile data
          }
        })
        .catch((err) => {
          console.error("Failed to fetch Wrike user:", err.message);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFetchLifetimeStats = async () => {
    if (!wrikeUser?.id) return;
    const token = localStorage.getItem("wrike_personal_token");
    setUserStats((prev) => ({ ...prev, loading: true }));

    try {
      let rawTasks = [];
      let nextPageToken = null;
      let hasMore = true;

      while (hasMore) {
        let url = `https://www.wrike.com/api/v4/tasks?responsibles=[${wrikeUser.id}]&status=Completed&pageSize=1000`;
        if (nextPageToken) url += `&nextPageToken=${nextPageToken}`;

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await response.json();
        rawTasks = [...rawTasks, ...(json.data || [])];
        nextPageToken = json.nextPageToken;
        hasMore = !!nextPageToken;
      }

      const now = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      const startOfYear = new Date(now.getFullYear(), 0, 1);

      let monthCount = 0;
      let yearCount = 0;

      rawTasks.forEach((task) => {
        const d = new Date(
          task.completedDate || task.updatedDate || task.createdDate || 0
        );
        if (d >= thirtyDaysAgo) monthCount++;
        if (d >= startOfYear) yearCount++;
      });

      setUserStats({
        month: monthCount,
        year: yearCount,
        allTime: rawTasks.length,
        loading: false,
        fetched: true,
      });
      triggerToast("Lifetime stats synced!", "success");
    } catch (err) {
      setUserStats((prev) => ({ ...prev, loading: false }));
      triggerToast("Failed to fetch stats.");
    }
  };

  const completedTasksCount = useMemo(() => {
    if (!wrikeData || !wrikeUser?.firstName) return 0;
    return wrikeData.filter(
      (t) =>
        t.assignees?.includes(wrikeUser.firstName) &&
        (t.status === "Completed" || t.status === "Delivered")
    ).length;
  }, [wrikeData, wrikeUser]);

  const myActiveWrikeTasks = useMemo(() => {
    if (!wrikeData || !wrikeUser?.firstName) return [];
    return wrikeData.filter(
      (t) => t.status === "Active" && t.assignees?.includes(wrikeUser.firstName)
    );
  }, [wrikeData, wrikeUser]);

  const myCompletedWrikeTasks = useMemo(() => {
    if (!wrikeData || !wrikeUser?.firstName) return [];
    return wrikeData.filter(
      (t) =>
        (t.status === "Completed" || t.status === "Delivered") &&
        t.assignees?.includes(wrikeUser.firstName)
    );
  }, [wrikeData, wrikeUser]);

  return {
    wrikeUser,
    userStats,
    handleFetchLifetimeStats,
    completedTasksCount,
    myActiveWrikeTasks,
    myCompletedWrikeTasks,
  };
}
