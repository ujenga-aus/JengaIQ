import { RFIComment } from '../RFIComment'

export default function RFICommentExample() {
  return (
    <div className="p-4 space-y-4">
      <RFIComment
        id="1"
        author="John Smith"
        authorInitials="JS"
        timestamp="2 hours ago"
        content="We need clarification on the steel specifications mentioned in drawing A-101. The grade specified doesn't match our supplier's catalog."
        attachments={[{ name: "reference-photo.jpg", url: "#" }]}
      />
      <RFIComment
        id="2"
        author="Sarah Wilson"
        authorInitials="SW"
        timestamp="1 hour ago"
        content="I've reviewed the specs and will get back to you by tomorrow with the correct grade information."
        isReply
      />
    </div>
  )
}
