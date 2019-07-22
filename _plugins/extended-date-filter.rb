# frozen_string_literal: true

require 'time'

module Jekyll
  module ExtendedDateFilter
    # Reformat a date using Ruby's core Time#strftime( string ) -> string
    # with additional replacements.
    #
    #   %a - The abbreviated weekday name (``Sun'')
    #   %A - The full weekday name (``Sunday'')
    #   %b - The abbreviated month name (``Jan'')
    #   %B - The full month name (``January'')
    #   %c - The preferred local date and time representation
    #   %d - Day of the month (01..31)
    #   %H - Hour of the day, 24-hour clock (00..23)
    #   %I - Hour of the day, 12-hour clock (01..12)
    #   %j - Day of the year (001..366)
    #   %m - Month of the year (01..12)
    #   %M - Minute of the hour (00..59)
    #   %o - Ordinal for the day of the month (st, nd, rd, th...)
    #   %p - Meridian indicator (``AM'' or ``PM'')
    #   %s - Number of seconds since 1970-01-01 00:00:00 UTC.
    #   %S - Second of the minute (00..60)
    #   %U - Week number of the current year,
    #           starting with the first Sunday as the first
    #           day of the first week (00..53)
    #   %W - Week number of the current year,
    #           starting with the first Monday as the first
    #           day of the first week (00..53)
    #   %w - Day of the week (Sunday is 0, 0..6)
    #   %x - Preferred representation for the date alone, no time
    #   %X - Preferred representation for the time alone, no date
    #   %y - Year without a century (00..99)
    #   %Y - Year with century
    #   %Z - Time zone name
    #   %% - Literal ``%'' character
    #
    #   See also: http://www.ruby-doc.org/core/Time.html#method-i-strftime
    def date(input, format)
      return input unless date = datetime(input)
      return input unless (format = format.to_s) && !format.empty?

      date.strftime(format.gsub(/%o/, ordinal(date.day)))
    end

    private

    def ordinal(number)
      return 'th' if (11..13).cover?(number.to_i % 100)

      case number.to_i % 10
      when 1 then 'st'
      when 2 then 'nd'
      when 3 then 'rd'
      else        'th'
      end
    end

    def datetime(date)
      case date
      when String
        Time.parse(date)
      else
        date
      end
    end
  end
end

Liquid::Template.register_filter(Jekyll::ExtendedDateFilter)
