fn strip_tag_block(content: &str, tag: &str) -> String {
    let lower = content.to_lowercase();
    let open_tag = format!("<{}", tag);
    let close_tag = format!("</{}>", tag);
    let mut result = String::new();
    let mut index = 0;

    while let Some(start) = lower[index..].find(&open_tag) {
        let start_idx = index + start;
        result.push_str(&content[index..start_idx]);

        if let Some(end) = lower[start_idx..].find(&close_tag) {
            let end_idx = start_idx + end + close_tag.len();
            index = end_idx;
        } else {
            return result;
        }
    }

    result.push_str(&content[index..]);
    result
}

pub fn sanitize_html(content: &str) -> String {
    let mut sanitized = content.to_string();

    for tag in ["script", "style", "iframe", "object", "embed"] {
        sanitized = strip_tag_block(&sanitized, tag);
    }

    sanitized
}
