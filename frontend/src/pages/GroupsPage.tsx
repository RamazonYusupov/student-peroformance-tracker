import { FormEvent, Fragment, useEffect, useState } from "react";

import { api } from "../api";
import { GroupEntity, GroupStudent } from "../types";

type GroupEditState = {
  name: string;
  students: GroupStudent[];
  addFullName: string;
  addStudentId: string;
};

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function hasDuplicateStudents(students: GroupStudent[]) {
  const seenIds = new Set<string>();
  for (const student of students) {
    const id = normalizeText(student.student_id).toLowerCase();
    if (!id) return true;
    if (seenIds.has(id)) return true;
    seenIds.add(id);
  }
  return false;
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<GroupEntity[]>([]);
  const [groupName, setGroupName] = useState("");
  const [studentFullName, setStudentFullName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [draftStudents, setDraftStudents] = useState<GroupStudent[]>([]);
  const [groupEdits, setGroupEdits] = useState<Record<string, GroupEditState>>({});
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [savingGroupId, setSavingGroupId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadGroups = () => {
    return api
      .listGroups()
      .then((result: GroupEntity[]) => {
        setGroups(result);
        setGroupEdits(
          Object.fromEntries(
            result.map((group) => [
              group.id,
              {
                name: group.name,
                students: (group.students || []).map((student) => ({
                  full_name: student.full_name,
                  student_id: student.student_id,
                })),
                addFullName: "",
                addStudentId: "",
              },
            ]),
          ),
        );
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const addStudentToDraft = () => {
    const fullName = normalizeText(studentFullName);
    const id = normalizeText(studentId);

    if (!fullName || !id) {
      setError("Student full name and student ID are required");
      return;
    }

    const duplicate = draftStudents.some(
      (student) =>
        student.student_id.toLowerCase() === id.toLowerCase() ||
        (student.full_name.toLowerCase() === fullName.toLowerCase() &&
          student.student_id.toLowerCase() === id.toLowerCase()),
    );

    if (duplicate) {
      setError("This student is already in the group list");
      return;
    }

    setDraftStudents((prev) => [...prev, { full_name: fullName, student_id: id }]);
    setStudentFullName("");
    setStudentId("");
    setError("");
  };

  const removeDraftStudent = (studentIdToRemove: string) => {
    setDraftStudents((prev) =>
      prev.filter((student) => student.student_id !== studentIdToRemove),
    );
  };

  const createGroup = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    const normalizedName = normalizeText(groupName);
    if (!normalizedName) {
      setError("Group name is required");
      return;
    }

    if (!draftStudents.length) {
      setError("Add at least one student before creating the group");
      return;
    }

    try {
      await api.createGroup({ name: normalizedName, students: draftStudents });
      setGroupName("");
      setDraftStudents([]);
      setStudentFullName("");
      setStudentId("");
      loadGroups();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteGroup = async (groupId: string) => {
    setError("");
    try {
      await api.deleteGroup(groupId);
      if (selectedGroupId === groupId) {
        setSelectedGroupId("");
      }
      if (expandedGroupId === groupId) {
        setExpandedGroupId(null);
      }
      setDeleteConfirmText("");
      loadGroups();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const updateGroupNameDraft = (groupId: string, value: string) => {
    setGroupEdits((prev) => ({
      ...prev,
      [groupId]: prev[groupId] ? { ...prev[groupId], name: value } : prev[groupId],
    }));
  };

  const updateStudentDraft = (
    groupId: string,
    studentIndex: number,
    key: "full_name" | "student_id",
    value: string,
  ) => {
    setGroupEdits((prev) => ({
      ...prev,
      [groupId]: prev[groupId]
        ? {
            ...prev[groupId],
            students: prev[groupId].students.map((student, index) =>
              index === studentIndex ? { ...student, [key]: value } : student,
            ),
          }
        : prev[groupId],
    }));
  };

  const removeStudentFromGroupDraft = (groupId: string, studentIndex: number) => {
    setGroupEdits((prev) => ({
      ...prev,
      [groupId]: prev[groupId]
        ? {
            ...prev[groupId],
            students: prev[groupId].students.filter((_, index) => index !== studentIndex),
          }
        : prev[groupId],
    }));
  };

  const setAddStudentField = (
    groupId: string,
    key: "addFullName" | "addStudentId",
    value: string,
  ) => {
    setGroupEdits((prev) => ({
      ...prev,
      [groupId]: prev[groupId] ? { ...prev[groupId], [key]: value } : prev[groupId],
    }));
  };

  const addStudentToExistingGroup = (groupId: string) => {
    const edit = groupEdits[groupId];
    if (!edit) return;

    const fullName = normalizeText(edit.addFullName);
    const id = normalizeText(edit.addStudentId);
    if (!fullName || !id) {
      setError("Student full name and student ID are required");
      return;
    }

    const duplicate = edit.students.some(
      (student) => student.student_id.toLowerCase() === id.toLowerCase(),
    );
    if (duplicate) {
      setError("Student ID already exists in this group");
      return;
    }

    setGroupEdits((prev) => ({
      ...prev,
      [groupId]: {
        ...prev[groupId],
        students: [...prev[groupId].students, { full_name: fullName, student_id: id }],
        addFullName: "",
        addStudentId: "",
      },
    }));
    setError("");
  };

  const saveGroupChanges = async (groupId: string) => {
    const edit = groupEdits[groupId];
    if (!edit) return;

    const normalizedName = normalizeText(edit.name);
    const normalizedStudents = edit.students
      .map((student) => ({
        full_name: normalizeText(student.full_name),
        student_id: normalizeText(student.student_id),
      }))
      .filter((student) => student.full_name && student.student_id);

    if (!normalizedName) {
      setError("Group name is required");
      return;
    }

    if (!normalizedStudents.length) {
      setError("Each group must have at least one student");
      return;
    }

    if (hasDuplicateStudents(normalizedStudents)) {
      setError("Student IDs in a group must be unique");
      return;
    }

    setError("");
    setSavingGroupId(groupId);
    try {
      await api.updateGroup(groupId, {
        name: normalizedName,
        students: normalizedStudents,
      });
      await loadGroups();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingGroupId(null);
    }
  };

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) || null;
  const selectedEdit = selectedGroupId ? groupEdits[selectedGroupId] : undefined;

  return (
    <div>
      <h1>Groups</h1>
      {error && <div className="error">{error}</div>}

      <section className="card">
        <div className="inline-actions" style={{ justifyContent: "space-between" }}>
          <h2 style={{ marginBottom: 0 }}>Create Group</h2>
          <button
            type="button"
            onClick={() => setShowCreateForm((prev) => !prev)}
          >
            {showCreateForm ? "Close" : "Create Group"}
          </button>
        </div>

        {showCreateForm && (
          <form onSubmit={createGroup} className="stack" style={{ marginTop: "12px" }}>
            <label>
              Group Name
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Example: Grade 10 - Section A"
                required
              />
            </label>

            <div className="card" style={{ marginBottom: 0 }}>
              <h3>Add Student</h3>
              <div className="split" style={{ marginBottom: "10px" }}>
                <label>
                  Full Name
                  <input
                    value={studentFullName}
                    onChange={(e) => setStudentFullName(e.target.value)}
                    placeholder="Student full name"
                  />
                </label>
                <label>
                  Student ID
                  <input
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    placeholder="Student ID"
                  />
                </label>
              </div>
              <div className="inline-actions">
                <button type="button" onClick={addStudentToDraft}>
                  Add Student
                </button>
              </div>

              {draftStudents.length > 0 ? (
                <table style={{ marginTop: "12px" }}>
                  <thead>
                    <tr>
                      <th>Full Name</th>
                      <th>Student ID</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftStudents.map((student) => (
                      <tr key={student.student_id}>
                        <td>{student.full_name}</td>
                        <td>{student.student_id}</td>
                        <td>
                          <button
                            type="button"
                            onClick={() => removeDraftStudent(student.student_id)}
                            style={{ background: "var(--danger)" }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted-text" style={{ marginTop: "10px" }}>
                  No students added yet.
                </p>
              )}
            </div>

            <button type="submit">Create Group</button>
          </form>
        )}
      </section>

      <section className="card">
        <h2>All Groups</h2>
        {!groups.length ? (
          <p className="muted-text">No groups found.</p>
        ) : (
          <table className="groups-table">
            <thead>
              <tr>
                <th>Group Name</th>
                <th>Students</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const isExpanded = expandedGroupId === group.id;
                const students = group.students || [];

                return (
                  <Fragment key={group.id}>
                    <tr className={`group-row ${isExpanded ? "expanded" : ""}`}>
                      <td>
                        <button
                          className="group-name-button"
                          type="button"
                          onClick={() =>
                            setExpandedGroupId((prev) => (prev === group.id ? null : group.id))
                          }
                          aria-expanded={isExpanded}
                        >
                          <span className="expand-indicator" aria-hidden="true">
                            {isExpanded ? "▾" : "▸"}
                          </span>
                          {group.name}
                        </button>
                      </td>
                      <td>
                        <span className="student-count-badge">{students.length}</span>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="group-students-row">
                        <td colSpan={2}>
                          <div className="group-students-panel">
                            {students.length ? (
                              <ul className="group-students-list">
                                {students.map((student) => (
                                  <li key={`${group.id}-${student.student_id}`} className="group-student-item">
                                    <span className="group-student-name">{student.full_name}</span>
                                    <span className="group-student-id">{student.student_id}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="muted-text" style={{ margin: 0 }}>
                                No students in this group.
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>Manage Group</h2>
        {groups.length === 0 ? (
          <p className="muted-text">Create a group first to manage it.</p>
        ) : (
          <>
            <label style={{ marginBottom: "10px" }}>
              Select Group
              <select
                value={selectedGroupId}
                onChange={(e) => {
                  setSelectedGroupId(e.target.value);
                  setDeleteConfirmText("");
                }}
              >
                <option value="">Choose a group</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>

            {selectedGroup && selectedEdit && (
              <div className="card" style={{ marginBottom: 0 }}>
                <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                  <h3 style={{ marginBottom: 0 }}>Editing: {selectedGroup.name}</h3>
                  <button
                    type="button"
                    onClick={() => saveGroupChanges(selectedGroup.id)}
                    disabled={savingGroupId === selectedGroup.id}
                  >
                    {savingGroupId === selectedGroup.id ? "Saving..." : "Save Changes"}
                  </button>
                </div>

                <label style={{ marginTop: "10px", marginBottom: "10px" }}>
                  Group Name
                  <input
                    value={selectedEdit.name}
                    onChange={(e) => updateGroupNameDraft(selectedGroup.id, e.target.value)}
                  />
                </label>

                <div className="split" style={{ marginBottom: "10px" }}>
                  <label>
                    Add Student: Full Name
                    <input
                      value={selectedEdit.addFullName}
                      onChange={(e) => setAddStudentField(selectedGroup.id, "addFullName", e.target.value)}
                      placeholder="Student full name"
                    />
                  </label>
                  <label>
                    Add Student: Student ID
                    <input
                      value={selectedEdit.addStudentId}
                      onChange={(e) => setAddStudentField(selectedGroup.id, "addStudentId", e.target.value)}
                      placeholder="Student ID"
                    />
                  </label>
                </div>
                <div className="inline-actions" style={{ marginBottom: "10px" }}>
                  <button type="button" onClick={() => addStudentToExistingGroup(selectedGroup.id)}>
                    Add Student
                  </button>
                </div>

                <table>
                  <thead>
                    <tr>
                      <th>Full Name</th>
                      <th>Student ID</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEdit.students.map((student, studentIndex) => (
                      <tr key={`${selectedGroup.id}-${student.student_id}-${studentIndex}`}>
                        <td>
                          <input
                            value={student.full_name}
                            onChange={(e) =>
                              updateStudentDraft(selectedGroup.id, studentIndex, "full_name", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={student.student_id}
                            onChange={(e) =>
                              updateStudentDraft(selectedGroup.id, studentIndex, "student_id", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => removeStudentFromGroupDraft(selectedGroup.id, studentIndex)}
                            style={{ background: "var(--danger)" }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="card" style={{ marginTop: "12px", marginBottom: 0, borderColor: "#f2b8b5" }}>
                  <h3>Danger Zone</h3>
                  <p className="muted-text">
                    Type <strong>{selectedGroup.name}</strong> to enable group deletion.
                  </p>
                  <div className="split" style={{ marginBottom: "10px" }}>
                    <label>
                      Confirm Group Name
                      <input
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder="Type group name to confirm"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteGroup(selectedGroup.id)}
                    style={{ background: "var(--danger)" }}
                    disabled={normalizeText(deleteConfirmText) !== selectedGroup.name}
                  >
                    Delete Group
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
