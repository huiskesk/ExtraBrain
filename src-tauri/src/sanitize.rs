use regex::Regex;

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

    for tag in ["script", "style", "iframe", "object"] {
        sanitized = strip_tag_block(&sanitized, tag);
    }

    let embed_re = Regex::new(r"(?is)<embed\b[^>]*>").expect("regex should compile: embed tag");
    let type_re = Regex::new(r#"(?is)type\s*=\s*["']([^"']+)["']"#)
        .expect("regex should compile: embed type");
    sanitized = embed_re
        .replace_all(&sanitized, |caps: &regex::Captures| {
            let tag = &caps[0];
            let is_pdf = type_re
                .captures(tag)
                .and_then(|capture| capture.get(1))
                .map(|value| value.as_str().trim().eq_ignore_ascii_case("application/pdf"))
                .unwrap_or(false);
            if is_pdf {
                tag.to_string()
            } else {
                String::new()
            }
        })
        .to_string();

    sanitized
}
