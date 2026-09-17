self.__MIDDLEWARE_MATCHERS = [
  {
    "regexp": "^(?:\\/(_next\\/data\\/[^/]{1,}))?(?:\\/((?!login|api\\/auth|_next\\/static|_next\\/image|favicon.ico|manifest.webmanifest|icons|brand).*))(\\.json|\\.rsc|\\.segments\\/.+\\.segment\\.rsc)?[\\/#\\?]?$",
    "originalSource": "/((?!login|api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons|brand).*)"
  }
];self.__MIDDLEWARE_MATCHERS_CB && self.__MIDDLEWARE_MATCHERS_CB()